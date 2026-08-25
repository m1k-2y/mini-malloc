#include <stddef.h>
#define HEADER_SIZE 8
#define ALIGNMENT 16
#define HEAP_SIZE 4096
#define ALIGN(size) ((((size) + (ALIGNMENT - 1)) / ALIGNMENT) * ALIGNMENT)
#define PADDING (ALIGN(HEADER_SIZE) - HEADER_SIZE)

static inline void *hdrp(void *bp) {
    return (char *)bp - HEADER_SIZE;
}

static inline size_t get_size(const void *header_p) {
    return *(const size_t *)header_p & ~(size_t)(ALIGNMENT - 1);
}

static inline size_t get_alloc(const void *header_p) {
    return *(const size_t *)header_p & (size_t)1;
}

static inline size_t pack(size_t size, size_t alloc) {
    return size | alloc;
}