#include <stddef.h>

size_t compute_size(size_t size_and_alloc) {

    size_t size = size_and_alloc & ~(size_t)1;

    return size;
}

size_t compute_alloc(size_t size_and_alloc) {

    size_t alloc = size_and_alloc & 1;

    return alloc;
}