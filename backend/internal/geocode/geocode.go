package geocode

import (
	"context"
	"errors"
	"strings"

	"github.com/freedom_case_2/backend/internal/models"
)

var ErrNotFound = errors.New("geocode not found")

type Geocoder interface {
	Geocode(ctx context.Context, query string) (lat float64, lon float64, displayName string, confidence float64, err error)
}

func BuildGeocodeQuery(country string, office string, address string) string {
	country = strings.TrimSpace(country)
	office = strings.TrimSpace(office)
	address = strings.TrimSpace(address)
	parts := []string{}
	if country != "" {
		parts = append(parts, country)
	}
	if office != "" {
		parts = append(parts, office)
	}
	if address != "" {
		parts = append(parts, address)
	}
	return strings.Join(parts, ", ")
}

func ShouldGeocode(unit models.BusinessUnit, force bool) bool {
	if force {
		return true
	}
	return unit.Lat == nil || unit.Lon == nil
}
