/* Run against the unchanged src/heap.c, before choosing a WASM heap backend. */
#include <stdio.h>
#include "heap.h"
#include "block.h"
#include "malloc.h"
#include "free.h"

int main(void) {
    printf("sizeof(size_t)=%zu, sizeof(BlockHeader)=%zu\n", sizeof(size_t), sizeof(BlockHeader));
    for (int i = 0; i < 3; ++i) {
        void *heap = allocate_heap_region(256);
        if (!heap) {
            puts("mmap allocation failed");
            return 1;
        }
        init_block_header(heap, 256);
        void *a = mini_malloc(17);
        if (!a) return 2;
        BlockHeader *header = (BlockHeader *)((char *)a - sizeof(BlockHeader));
        printf("cycle=%d block=%zu raw=%zu\n", i, get_block_size(header), header->size_and_flag);
        mini_free(a);
        destroy_heap();
        printf("destroy: start_is_null=%d size=%zu\n", heap_start == NULL, heap_size);
        if (heap_start != NULL || heap_size != 0) return 3;
    }
    return 0;
}
