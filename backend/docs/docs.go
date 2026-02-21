package docs

import "github.com/swaggo/swag"

const docTemplate = `{
  "swagger": "2.0",
  "info": {
    "title": "F.I.R.E. Backend",
    "description": "API for AI ticket enrichment and manager assignment",
    "version": "1.0"
  },
  "basePath": "/",
  "paths": {}
}`

func init() {
	swag.Register(swag.Name, &s{})
}

type s struct{}

func (s *s) ReadDoc() string {
	return docTemplate
}
