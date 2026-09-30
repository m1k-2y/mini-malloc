#include <stdio.h>
#include <stddef.h>
#include "heap.h"
#include "block.h"
#include "malloc.h"

int main() {

    size_t memory_size;
    scanf("%zu", &memory_size);

    memory_size = alignment(memory_size);

    void *heap = allocate_heap_region(memory_size);

    if (heap = NULL) {
        return 1;
    }

    init_block_header(heap, memory_size);

    return 0;
}