#include <stdint.h>
#include "heap.h"
#include "block.h"
#include "malloc.h"
#include "free.h"

/* MEMORY64=2 preserves native size_t layout but emits wasm32-compatible memory. */
_Static_assert(sizeof(size_t) == 8, "Build with -sMEMORY64=2");
_Static_assert(sizeof(BlockHeader) == 16, "BlockHeader must remain 16 bytes");

/* Fixed-width exports avoid exposing the internal 64-bit pointer ABI to JS. */
int mm_init(uint32_t requested) {
    if (requested == 0 || requested > 1024 * 1024) return 0;
    size_t size = alignment(requested);
    destroy_heap();
    void *heap = allocate_heap_region(size);
    if (heap == NULL) return 0;
    init_block_header(heap, size);
    return 1;
}

uint32_t mm_malloc(uint32_t requested) {
    if (heap_start == NULL || requested > 1024 * 1024) return 0;
    return (uint32_t)(uintptr_t)mini_malloc(requested);
}

void mm_free(uint32_t pointer) {
    mini_free((void *)(uintptr_t)pointer);
}

void mm_destroy(void) { destroy_heap(); }
uint32_t mm_heap_start(void) { return (uint32_t)(uintptr_t)heap_start; }
uint32_t mm_heap_size(void) { return (uint32_t)heap_size; }
uint32_t mm_header_size(void) { return sizeof(BlockHeader); }
uint32_t mm_align(uint32_t size) { return (uint32_t)alignment(size); }
uint32_t mm_block_size(uint32_t pointer) {
    return (uint32_t)get_block_size((BlockHeader *)(uintptr_t)pointer);
}
