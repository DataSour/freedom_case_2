package geocode

import (
	"testing"

	"github.com/freedom_case_2/backend/internal/models"
)

func TestBuildGeocodeQuery(t *testing.T) {
	q := BuildGeocodeQuery("Kazakhstan", "Astana", "ул. Абая 10")
	if q != "Kazakhstan, Astana, ул. Абая 10" {
		t.Fatalf("unexpected query: %s", q)
	}
}

func TestShouldGeocodeSkipWhenLatLonExists(t *testing.T) {
	lat := 51.0
	lon := 71.0
	unit := models.BusinessUnit{ID: "1", Name: "ASTANA", Lat: &lat, Lon: &lon}
	if ShouldGeocode(unit, false) {
		t.Fatalf("expected geocode to be skipped when lat/lon exist")
	}
	if !ShouldGeocode(unit, true) {
		t.Fatalf("expected geocode when force is true")
	}
}
