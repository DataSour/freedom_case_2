package geocode

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"sync"
	"time"
)

type NominatimGeocoder struct {
	BaseURL     string
	UserAgent   string
	MinInterval time.Duration
	Client      *http.Client

	mu        sync.Mutex
	lastReqAt time.Time
	cache     map[string]nominatimResult
}

type nominatimResult struct {
	Lat         float64
	Lon         float64
	DisplayName string
	Confidence  float64
}

type nominatimItem struct {
	Lat         string  `json:"lat"`
	Lon         string  `json:"lon"`
	DisplayName string  `json:"display_name"`
	Importance  float64 `json:"importance"`
}

func (g *NominatimGeocoder) Geocode(ctx context.Context, query string) (float64, float64, string, float64, error) {
	if g.Client == nil {
		g.Client = &http.Client{Timeout: 10 * time.Second}
	}
	if g.BaseURL == "" {
		g.BaseURL = "https://nominatim.openstreetmap.org"
	}
	if g.UserAgent == "" {
		g.UserAgent = "fire-hackathon-demo"
	}
	if g.MinInterval <= 0 {
		g.MinInterval = time.Second
	}

	g.mu.Lock()
	if g.cache == nil {
		g.cache = map[string]nominatimResult{}
	}
	if cached, ok := g.cache[query]; ok {
		g.mu.Unlock()
		return cached.Lat, cached.Lon, cached.DisplayName, cached.Confidence, nil
	}
	sleepFor := time.Until(g.lastReqAt.Add(g.MinInterval))
	if sleepFor > 0 {
		g.mu.Unlock()
		time.Sleep(sleepFor)
		g.mu.Lock()
	}
	g.lastReqAt = time.Now()
	g.mu.Unlock()

	endpoint := fmt.Sprintf("%s/search?q=%s&format=json&addressdetails=1&limit=1", g.BaseURL, url.QueryEscape(query))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return 0, 0, "", 0, err
	}
	req.Header.Set("User-Agent", g.UserAgent)

	resp, err := g.Client.Do(req)
	if err != nil {
		return 0, 0, "", 0, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return 0, 0, "", 0, fmt.Errorf("nominatim http error: %s", resp.Status)
	}

	var items []nominatimItem
	if err := json.NewDecoder(resp.Body).Decode(&items); err != nil {
		return 0, 0, "", 0, err
	}
	result, err := parseNominatimItems(items)
	if err != nil {
		return 0, 0, "", 0, err
	}

	g.mu.Lock()
	g.cache[query] = result
	g.mu.Unlock()

	return result.Lat, result.Lon, result.DisplayName, result.Confidence, nil
}

func parseNominatimItems(items []nominatimItem) (nominatimResult, error) {
	if len(items) == 0 {
		return nominatimResult{}, ErrNotFound
	}
	lat, err := strconv.ParseFloat(items[0].Lat, 64)
	if err != nil {
		return nominatimResult{}, err
	}
	lon, err := strconv.ParseFloat(items[0].Lon, 64)
	if err != nil {
		return nominatimResult{}, err
	}
	result := nominatimResult{
		Lat:         lat,
		Lon:         lon,
		DisplayName: items[0].DisplayName,
		Confidence:  items[0].Importance,
	}
	if errors.Is(resultErr(result), ErrNotFound) {
		return nominatimResult{}, ErrNotFound
	}
	return result, nil
}

func resultErr(res nominatimResult) error {
	if res.Lat == 0 && res.Lon == 0 && res.DisplayName == "" {
		return ErrNotFound
	}
	return nil
}
