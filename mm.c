#include "heap.h"
#include "mm.h"
#include "mm_internal.h"
#include <stddef.h>

static void *next_free;

int mm_init(void) {

    int result = mem_init(HEAP_SIZE);

    if (result == -1) {
        return -1;
    }

    next_free = mem_heap_lo() + PADDING; 

    return 0;
    
}

void *mm_malloc(size_t size) {

    size_t size_total = ALIGN(size + HEADER_SIZE);

    *(size_t *)next_free = size_total;

    void *user_p = (char *)next_free + HEADER_SIZE;

    next_free = (char *)next_free + size_total;

    return user_p;
}