#include <sys/mman.h>
#include <stddef.h>
#include "heap.h"

static void *heap_start;

int mem_init(size_t size) {

    heap_start = mmap(NULL, size, PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);

    if (heap_start == MAP_FAILED) {
        return -1;
    }

    return 0;
}

void *mem_heap_lo(void) {
    return heap_start;
}