#include "heap.h"
#include <stddef.h>

static void *next_free;

int mm_init(void) {

    int result = mem_init(4096);

    if (result == -1) {
        return -1;
    }

    next_free = mem_heap_lo(); 

    return 0;
    
}

void *mm_malloc(size_t size) {

    size_t size_total = (((size + 15) / 16) * 16 + 8);

    *(size_t *)next_free = size_total;

    void *user_p = (char *)next_free + 8;

    next_free = (char *)next_free + size_total;

    return user_p;
}