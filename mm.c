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

    next_free = (char *)mem_heap_lo() + PADDING; 

    return 0;
    
}

void *mm_malloc(size_t size) {

    size_t size_total = ALIGN(size + HEADER_SIZE);


    *(size_t *)next_free = pack(size_total, 1);

    void *user_p = (char *)next_free + HEADER_SIZE;

    next_free = (char *)next_free + size_total;

    return user_p;
}

void mm_free(void *bp) {
    
    if (bp == NULL) {
        return;
    }

    void *header_p = hdrp(bp);

    *(size_t *)header_p = *(size_t *)header_p & ~((size_t)1);
}