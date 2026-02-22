package handlers

import (
	"bytes"
	"mime/multipart"
	"testing"
)

func TestParseManagersCSV_NoLoadColumn(t *testing.T) {
	content := "manager_id,name,office,role,skills\nm1,Test Manager,Astana,Специалист,RU\n"
	fh := makeMultipartFile(t, "managers", "managers.csv", content)
	managers, errs := parseManagersCSV(fh)
	if len(errs) > 0 {
		t.Fatalf("expected no errors, got %v", errs)
	}
	if len(managers) != 1 {
		t.Fatalf("expected 1 manager, got %d", len(managers))
	}
	if managers[0].CurrentLoad != 0 {
		t.Fatalf("expected current_load=0, got %d", managers[0].CurrentLoad)
	}
	if managers[0].BaselineLoad != 0 {
		t.Fatalf("expected baseline_load=0, got %d", managers[0].BaselineLoad)
	}
}

func makeMultipartFile(t *testing.T, fieldName, filename, content string) *multipart.FileHeader {
	t.Helper()
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	part, err := writer.CreateFormFile(fieldName, filename)
	if err != nil {
		t.Fatalf("create form file: %v", err)
	}
	if _, err := part.Write([]byte(content)); err != nil {
		t.Fatalf("write content: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close writer: %v", err)
	}

	reader := multipart.NewReader(&buf, writer.Boundary())
	form, err := reader.ReadForm(int64(buf.Len()))
	if err != nil {
		t.Fatalf("read form: %v", err)
	}
	files := form.File[fieldName]
	if len(files) == 0 {
		t.Fatalf("no file headers found")
	}
	return files[0]
}
