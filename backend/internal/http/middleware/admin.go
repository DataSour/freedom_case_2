package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func AdminKey(required string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if required == "" {
			c.Next()
			return
		}
		key := c.GetHeader("X-Admin-Key")
		if key != required {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": gin.H{
					"code": "UNAUTHORIZED",
					"message": "Invalid admin key",
				},
			})
			return
		}
		c.Next()
	}
}
