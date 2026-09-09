#include <stddef.h>
#include "bit_compute.h"

struct BlockHeader {
    size_t size_and_alloc;
    size_t something;
};

struct BlockHeader *init_header(void *p, size_t block_size) {
    
    struct BlockHeader *header1 = p;

    header1 -> size_and_alloc = block_size;

    return header1;
}

size_t header_reader(void *p) {

    struct BlockHeader *header = p;

    size_t size_and_alloc = header -> size_and_alloc;

    return size_and_alloc;
}

void *request_block(void *heap_start, size_t size, size_t heap_size) {
    
    size_t block_size;

    if (size % 16 == 0) {
        block_size = 16 + size;
    }

    else {
        block_size = (16 - size % 16) + size + 16;
    }  

    char *current = heap_start;
    char *heap_end = (char *)heap_start + heap_size;

    while (current + block_size <= heap_end) {
        
        size_t size_and_alloc = header_reader(current);

        size_t current_size = compute_size(size_and_alloc);
        size_t alloc = compute_alloc(size_and_alloc);

        if (current_size >= block_size && alloc == 0) {
            struct BlockHeader *header = (struct BlockHeader *)current;

            size_t new_size = current_size - block_size;

            if (new_size >= 32) {
                header -> size_and_alloc = block_size | 1;

                struct BlockHeader *new_header = (struct BlockHeader *)(current + block_size);

                new_header -> size_and_alloc = new_size;
            }

            else {
                header -> size_and_alloc = current_size | 1;
            }
            
            void *payload = (char *)current + 16;

            return payload;
        }

        else {
            current = (char *)current + current_size;
        }
    }

    return NULL;
}