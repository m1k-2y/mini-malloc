#include <stddef.h>
#include "block.h"
#include "heap.h"

size_t alignment(size_t block_size) {

    if (block_size % 16 == 0) {
        return block_size;
    }

    else {
        size_t alignment_size = 16 * (block_size / 16 + 1);

        return alignment_size;
    }
}

BlockHeader *find_free_block(size_t required_size) {
    
    BlockHeader *header = heap_start;

    while ((char *)header < (char *)heap_end) {
        if (is_allocated(header) == 0 && get_block_size(header) >= required_size) {
            return header;
        }

        else {
            header = (BlockHeader *)((char *)header + get_block_size(header));
        }
    }

    return NULL;
}

size_t required_block_size(size_t payload_size) {
    return alignment(payload_size) + sizeof(BlockHeader);
}

void *mini_malloc(size_t size) {

    size_t required_size = required_block_size(size);

    BlockHeader *new_malloc_header = find_free_block(required_size);

    if (new_malloc_header == NULL) {
        return NULL;
    }

    init_block_header(new_malloc_header, required_size);

    mark_allocated(new_malloc_header);

    return (char *)new_malloc_header + sizeof(BlockHeader);
}