package config

import (
	"time"

	"github.com/spf13/viper"
)

type Config struct {
	Env                   string        `mapstructure:"ENV"`
	Port                  string        `mapstructure:"PORT"`
	DatabaseURL           string        `mapstructure:"DATABASE_URL"`
	AdminKey              string        `mapstructure:"ADMIN_KEY"`
	AIURL                 string        `mapstructure:"AI_URL"`
	AssistantBaseURL      string        `mapstructure:"ASSISTANT_BASE_URL"`
	AssistantModel        string        `mapstructure:"ASSISTANT_MODEL"`
	AssistantAPIKey       string        `mapstructure:"ASSISTANT_API_KEY"`
	AssistantMaxTokens    int           `mapstructure:"ASSISTANT_MAX_TOKENS"`
	GeocoderProvider      string        `mapstructure:"GEOCODER_PROVIDER"`
	GeocoderUserAgent     string        `mapstructure:"GEOCODER_USER_AGENT"`
	GeocoderMinIntervalMS int           `mapstructure:"GEOCODER_MIN_INTERVAL_MS"`
	CountryDefault        string        `mapstructure:"COUNTRY_DEFAULT"`
	CORSAllowed           string        `mapstructure:"CORS_ALLOWED_ORIGINS"`
	RequestTimeout        time.Duration `mapstructure:"REQUEST_TIMEOUT"`
	LogLevel              string        `mapstructure:"LOG_LEVEL"`
	MaxUploadSizeMB       int64         `mapstructure:"MAX_UPLOAD_MB"`
}

func Load() (Config, error) {
	v := viper.New()
	v.SetConfigFile(".env")
	v.SetConfigType("env")
	v.AutomaticEnv()
	_ = v.ReadInConfig()

	v.SetDefault("ENV", "dev")
	v.SetDefault("PORT", "8080")
	v.SetDefault("REQUEST_TIMEOUT", "30s")
	v.SetDefault("LOG_LEVEL", "info")
	v.SetDefault("CORS_ALLOWED_ORIGINS", "*")
	v.SetDefault("MAX_UPLOAD_MB", 20)
	v.SetDefault("ASSISTANT_BASE_URL", "https://g4f.space/v1")
	v.SetDefault("ASSISTANT_MODEL", "gpt-4o")
	v.SetDefault("ASSISTANT_MAX_TOKENS", 2048)
	v.SetDefault("GEOCODER_PROVIDER", "nominatim")
	v.SetDefault("GEOCODER_USER_AGENT", "fire-hackathon-demo")
	v.SetDefault("GEOCODER_MIN_INTERVAL_MS", 1000)
	v.SetDefault("COUNTRY_DEFAULT", "Kazakhstan")

	var cfg Config
	if err := v.Unmarshal(&cfg); err != nil {
		return Config{}, err
	}
	return cfg, nil
}
