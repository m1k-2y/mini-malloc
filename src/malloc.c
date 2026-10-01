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

int split_block(BlockHeader *header, size_t required_size) {

    size_t original_block = get_block_size(header);
    size_t new_free_block_size = original_block - required_size;

    BlockHeader *new_free_block = (BlockHeader *)((char *)header + required_size);

    if (new_free_block_size >= 32) {
        init_block_header(new_free_block, new_free_block_size);

        return 1;
    }

    else {
        return 0;
    }
}

BlockHeader *find_free_block(size_t required_size) {
    
    BlockHeader *header = heap_start;

    while ((char *)header < (char *)heap_end) {
        size_t block_size = get_block_size(header);

        if (block_size == 0) {
            return NULL;
        }

        if ((char *)header + block_size > (char *)heap_end) {
            return NULL;
        }

        if (is_allocated(header) == 0 && block_size >= required_size) {
            return header;
        }

        else {
            header = (BlockHeader *)((char *)header + block_size);
        }
    }

    return NULL;
}

size_t required_block_size(size_t payload_size) {
    return alignment(payload_size) + sizeof(BlockHeader);
}

void *mini_malloc(size_t size) {

    if (size == 0) {
        return NULL;
    }

    size_t required_size = required_block_size(size);

    BlockHeader *new_malloc_header = find_free_block(required_size);

    if (new_malloc_header == NULL) {
        return NULL;
    }

    if (split_block(new_malloc_header, required_size) == 1) {
        init_block_header(new_malloc_header, required_size);
    }

    mark_allocated(new_malloc_header);

    return (char *)new_malloc_header + sizeof(BlockHeader);
}