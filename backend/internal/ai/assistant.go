package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type Assistant interface {
	Ask(ctx context.Context, prompt string, history []ChatMessage) (string, error)
}

type OpenAICompatAssistant struct {
	BaseURL string
	Model   string
	APIKey  string
	MaxTokens int
}

var (
	cacheMu    sync.Mutex
	cacheStore = map[string]cacheEntry{}
	cacheTTL   = 60 * time.Second
)

type cacheEntry struct {
	value string
	exp   time.Time
}

type RateLimitError struct {
	RetryAfter time.Duration
}

func (r RateLimitError) Error() string {
	if r.RetryAfter > 0 {
		return fmt.Sprintf("rate limited, retry after %s", r.RetryAfter)
	}
	return "rate limited"
}

func (a OpenAICompatAssistant) Ask(ctx context.Context, prompt string, history []ChatMessage) (string, error) {
	if strings.TrimSpace(a.BaseURL) == "" {
		return "", fmt.Errorf("ASSISTANT_BASE_URL is not set")
	}
	if strings.TrimSpace(a.Model) == "" {
		return "", fmt.Errorf("ASSISTANT_MODEL is not set")
	}

	if v, ok := cacheGet(prompt); ok {
		return v, nil
	}

	type msg struct {
		Role    string `json:"role"`
		Content string `json:"content"`
	}
	payload := struct {
		Model       string `json:"model"`
		Temperature float64 `json:"temperature,omitempty"`
		MaxTokens   int `json:"max_tokens,omitempty"`
		Messages    []msg  `json:"messages"`
	}{
		Model:    a.Model,
		MaxTokens: a.MaxTokens,
		Messages: []msg{},
	}

	for _, h := range history {
		payload.Messages = append(payload.Messages, msg{Role: h.Role, Content: h.Content})
	}
	payload.Messages = append(payload.Messages, msg{Role: "user", Content: prompt})

	b, _ := json.Marshal(payload)
	url := strings.TrimRight(a.BaseURL, "/") + "/chat/completions"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(b))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	if strings.TrimSpace(a.APIKey) != "" {
		req.Header.Set("Authorization", "Bearer "+a.APIKey)
	}

	timeout := 45 * time.Second
	if deadline, ok := ctx.Deadline(); ok {
		if remaining := time.Until(deadline); remaining > 0 && remaining < timeout {
			timeout = remaining
		}
	}
	client := &http.Client{Timeout: timeout}
	resp, err := client.Do(req)
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) {
			return "", fmt.Errorf("assistant request timed out")
		}
		var netErr net.Error
		if errors.As(err, &netErr) && netErr.Timeout() {
			return "", fmt.Errorf("assistant request timed out")
		}
		return "", fmt.Errorf("assistant request failed")
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		var errBody map[string]any
		_ = json.NewDecoder(resp.Body).Decode(&errBody)
		if resp.StatusCode == http.StatusTooManyRequests {
			if d := extractRetryAfter(errBody); d > 0 {
				return "", RateLimitError{RetryAfter: d}
			}
			return "", RateLimitError{}
		}
		return "", fmt.Errorf("assistant http error: %s: %v", resp.Status, errBody)
	}

	var res struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return "", err
	}
	if len(res.Choices) == 0 {
		return "", fmt.Errorf("empty assistant response")
	}
	answer := res.Choices[0].Message.Content
	cacheSet(prompt, answer)
	return answer, nil
}

func cacheGet(key string) (string, bool) {
	cacheMu.Lock()
	defer cacheMu.Unlock()
	if e, ok := cacheStore[key]; ok {
		if time.Now().Before(e.exp) {
			return e.value, true
		}
		delete(cacheStore, key)
	}
	return "", false
}

func cacheSet(key, value string) {
	cacheMu.Lock()
	defer cacheMu.Unlock()
	cacheStore[key] = cacheEntry{
		value: value,
		exp:   time.Now().Add(cacheTTL),
	}
}

func extractRetryAfter(errBody map[string]any) time.Duration {
	errObj, ok := errBody["error"].(map[string]any)
	if !ok {
		return 0
	}
	details, ok := errObj["details"].([]any)
	if !ok {
		return 0
	}
	for _, d := range details {
		m, ok := d.(map[string]any)
		if !ok {
			continue
		}
		if t, ok := m["@type"].(string); ok && strings.Contains(t, "RetryInfo") {
			if s, ok := m["retryDelay"].(string); ok {
				if dur, err := time.ParseDuration(s); err == nil {
					return dur
				}
			}
		}
	}
	return 0
}
