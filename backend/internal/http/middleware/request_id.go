package middleware

import (
	"fmt"
	"math/rand"
	"time"

	"github.com/gin-gonic/gin"
)

const RequestIDHeader = "X-Request-Id"

func RequestID() gin.HandlerFunc {
	rand.Seed(time.Now().UnixNano())
	return func(c *gin.Context) {
		rid := c.GetHeader(RequestIDHeader)
		if rid == "" {
			rid = fmt.Sprintf("req_%d_%d", time.Now().UnixNano(), rand.Intn(100000))
		}
		c.Set(RequestIDHeader, rid)
		c.Writer.Header().Set(RequestIDHeader, rid)
		c.Next()
	}
}
