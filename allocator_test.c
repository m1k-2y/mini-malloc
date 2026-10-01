#include <stdio.h>
#include <stddef.h>
#include "heap.h"
#include "malloc.h"
#include "block.h"
#include "free.h"

int main(void) {

    void *ptr = allocate_heap_region(24 * sizeof(int));

    if (ptr == NULL) {
        return 1;
    }

    init_block_header(ptr, heap_size);

    void *a = mini_malloc(16);
    void *b = mini_malloc(16);
    void *c = mini_malloc(16);

    BlockHeader *a_header = (BlockHeader *)((char *)a - sizeof(BlockHeader));
    BlockHeader *b_header = (BlockHeader *)((char *)b - sizeof(BlockHeader));
    BlockHeader *c_header = (BlockHeader *)((char *)c - sizeof(BlockHeader));

    printf("address a: %p\n", (void *)a_header);
    printf("address b: %p\n", (void *)b_header);
    printf("address c: %p\n", (void *)c_header);

    printf("size of a: %zu\n", get_block_size(a_header));
    printf("size of b: %zu\n", get_block_size(b_header));
    printf("size of c: %zu\n", get_block_size(c_header));

    mini_free(b);
    printf("After 'b' free.\n");

    printf("Is 'a' allocated? %d\n", is_allocated(a_header));
    printf("Is 'b' allocated? %d\n", is_allocated(b_header));
    printf("Is 'c' allocated? %d\n", is_allocated(c_header));

    mini_free(c);
    printf("After 'c' free.\n");

    printf("address a: %p\n", (void *)a_header);
    printf("address b: %p\n", (void *)b_header);

    printf("size of a: %zu\n", get_block_size(a_header));
    printf("size of b: %zu\n", get_block_size(b_header));

    printf("Is 'a' allocated? %d\n", is_allocated(a_header));
    printf("Is 'b' allocated? %d\n", is_allocated(b_header));

    mini_free(a);
    printf("After 'a' free.\n");

    printf("final heap size: %zu\n", get_block_size(heap_start));

    printf("final allocated? %d\n", is_allocated(heap_start));

    return 0;
}