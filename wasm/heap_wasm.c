/* Browser-only heap storage. Allocation algorithms remain in the original C source files. */
#include <stdalign.h>
#include <string.h>
#include "heap.h"

#define MAX_HEAP_SIZE (1024 * 1024)

/* One bounded region in WASM linear memory, matching the visualizer's 1 MiB cap. */
static alignas(16) unsigned char region[MAX_HEAP_SIZE];
void *heap_start;
void *heap_end;
size_t heap_size;

void *allocate_heap_region(size_t size) {
    if (size == 0 || size > sizeof(region) || heap_start != NULL) return NULL;
    memset(region, 0, size);
    heap_start = region;
    heap_end = region + size;
    heap_size = size;
    return heap_start;
}

void destroy_heap(void) {
    /* The backing region lives with the WASM instance; logical heap ownership ends. */
    heap_start = NULL;
    heap_end = NULL;
    heap_size = 0;
}
