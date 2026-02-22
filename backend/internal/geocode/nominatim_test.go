package geocode

import "testing"

func TestParseNominatimItems(t *testing.T) {
	items := []nominatimItem{
		{
			Lat:         "51.1605",
			Lon:         "71.4704",
			DisplayName: "Astana, Kazakhstan",
			Importance:  0.72,
		},
	}
	res, err := parseNominatimItems(items)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res.Lat != 51.1605 || res.Lon != 71.4704 {
		t.Fatalf("unexpected coordinates: %+v", res)
	}
	if res.DisplayName != "Astana, Kazakhstan" {
		t.Fatalf("unexpected display name: %s", res.DisplayName)
	}
	if res.Confidence != 0.72 {
		t.Fatalf("unexpected confidence: %f", res.Confidence)
	}
}
