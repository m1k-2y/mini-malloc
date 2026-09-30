#include <stdio.h>
#include <stddef.h>
#include "heap.h"
#include "block.h"

int main() {

    size_t memory_size;
    scanf("%zu", &memory_size);

    void *heap = allocate_heap_region(memory_size);

    init_block_header(heap, memory_size);
}