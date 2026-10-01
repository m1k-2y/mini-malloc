#include <stdio.h>
#include <stddef.h>
#include "heap.h"
#include "block.h"
#include "malloc.h"
#include "free.h"

void test_no_split(void) {

    printf("Is split prevented for a small remainder?\n");
    
    void *ptr = allocate_heap_region(64);

    if (ptr == NULL) {
        return;
    }

    init_block_header(ptr, 64);

    void *a = mini_malloc(32);

    if (a == NULL) {
        printf("malloc failed\n");

        destroy_heap();

        return;
    }

    BlockHeader *a_header = (BlockHeader *)((char *)a - sizeof(BlockHeader));

    printf("size of a: %zu\n", get_block_size(a_header));

    destroy_heap();
}

void test_minimum_split(void) {

    printf("Is split allowed for the minimum remainder?\n");

    void *ptr = allocate_heap_region(80);

    if (ptr == NULL) {
        return;
    }

    init_block_header(ptr, 80);

    void *a = mini_malloc(32);

    if (a == NULL) {
        printf("malloc failed\n");

        destroy_heap();

        return;
    }

    BlockHeader *a_header = (BlockHeader *)((char *)a - sizeof(BlockHeader));

    BlockHeader *next_header = (BlockHeader *)((char *)a_header + get_block_size(a_header));

    printf("size of a: %zu\n", get_block_size(a_header));
    printf("size of next block: %zu\n", get_block_size(next_header));
    printf("Is next block allocated? %d\n", is_allocated(next_header));

    destroy_heap();
}

void test_first_fit_reuse(void) {

    printf("Is first-fit reused?\n");

    void *ptr = allocate_heap_region(96);

    if (ptr == NULL) {
        return;
    }

    init_block_header(ptr, 96);

    void *a = mini_malloc(16);

    if (a == NULL) {
        printf("malloc failed\n");

        destroy_heap();

        return;
    }

    void *b = mini_malloc(16);

    if (b == NULL) {
        printf("malloc failed\n");

        destroy_heap();

        return;
    }

    void *c = mini_malloc(16);

    if (c == NULL) {
        printf("malloc failed\n");

        destroy_heap();

        return;
    }

    mini_free(b);

    void *d = mini_malloc(16);

    if (d == NULL) {
        printf("malloc failed\n");

        destroy_heap();

        return;
    }

    BlockHeader *b_header = (BlockHeader *)((char *)b - sizeof(BlockHeader));
    BlockHeader *d_header = (BlockHeader *)((char *)d - sizeof(BlockHeader));

    printf("address b: %p\n", (void *)b_header);
    printf("address d: %p\n", (void *)d_header);

    destroy_heap();
}

void test_malloc_zero(void) {

    printf("Is malloc(0) returning NULL?\n");

    void *ptr = allocate_heap_region(96);

    if (ptr == NULL) {
        return;
    }

    init_block_header(ptr, 96);

    void *a = mini_malloc(0);

    if (a == NULL) {
        printf("a is NULL\n");
    }

    else {
        printf("a is not NULL: %p\n", (void *)a);
    }

    destroy_heap();
}

void test_oversized_malloc(void) {

    printf("Is an oversized allocation rejected?\n");

    void *ptr = allocate_heap_region(64);

    if (ptr == NULL) {
        return;
    }

    init_block_header(ptr, 64);

    void *a = mini_malloc(64);

    if (a == NULL) {
        printf("a is NULL\n");
    }

    else {
        printf("a is not NULL: %p\n", (void *)a);
    }

    destroy_heap();
}

void test_exact_fit(void) {

    printf("Is an exact-fit block allocated correctly?\n");

    void *ptr = allocate_heap_region(32);

    if (ptr == NULL) {
        return;
    }

    init_block_header(ptr, 32);

    void *a = mini_malloc(16);

    if (a == NULL) {
        printf("malloc failed\n");

        destroy_heap();

        return;
    }

    BlockHeader *a_header = (BlockHeader *)((char *)a - sizeof(BlockHeader));

    printf("size of a: %zu\n", get_block_size(a_header));
    printf("Is a allocated? %d\n", is_allocated(a_header));

    destroy_heap();
}

void test_alignment(void) {

    printf("Is alignment handled correctly?\n");

    printf("%zu\n", required_block_size(17));
}

void test_free_null(void) {
    printf("Is free(NULL) handled safely?\n");

    void *ptr = allocate_heap_region(32);

    if (ptr == NULL) {
        return;
    }

    init_block_header(ptr, 32);

    size_t before_size = get_block_size((BlockHeader *)heap_start);
    int before_alloc = is_allocated((BlockHeader *)heap_start);

    mini_free(NULL);

    size_t after_size = get_block_size((BlockHeader *)heap_start);
    int after_alloc = is_allocated((BlockHeader *)heap_start);

    printf("size before: %zu, after: %zu\n", before_size, after_size);
    printf("allocated before: %d, after: %d\n", before_alloc, after_alloc);

    destroy_heap();
}

int main(void) {

    test_no_split();

    test_minimum_split();

    test_first_fit_reuse();

    test_malloc_zero();

    test_oversized_malloc();

    test_exact_fit();

    test_alignment();

    test_free_null();

    return 0;
}