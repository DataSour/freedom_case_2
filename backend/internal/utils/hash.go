package utils

import "hash/fnv"

func HashStringToUint64(s string) uint64 {
	h := fnv.New64a()
	_, _ = h.Write([]byte(s))
	return h.Sum64()
}
