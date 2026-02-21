package config

import (
	"time"

	"github.com/spf13/viper"
)

type Config struct {
	Env              string        `mapstructure:"ENV"`
	Port             string        `mapstructure:"PORT"`
	DatabaseURL      string        `mapstructure:"DATABASE_URL"`
	AdminKey         string        `mapstructure:"ADMIN_KEY"`
	AIURL            string        `mapstructure:"AI_URL"`
	CORSAllowed      string        `mapstructure:"CORS_ALLOWED_ORIGINS"`
	RequestTimeout   time.Duration `mapstructure:"REQUEST_TIMEOUT"`
	LogLevel         string        `mapstructure:"LOG_LEVEL"`
	MaxUploadSizeMB  int64         `mapstructure:"MAX_UPLOAD_MB"`
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

	var cfg Config
	if err := v.Unmarshal(&cfg); err != nil {
		return Config{}, err
	}
	return cfg, nil
}
