#include <stddef.h>
#include "block.h"
#include "heap.h"

void merge_block(BlockHeader *header, BlockHeader *next_header) {

    size_t next_block_size = get_block_size(next_header);

    add_block_size(header, next_block_size);
}

void coalesce_previous(BlockHeader *header) {

    BlockHeader *previous_header = heap_start;

    while ((char *)previous_header < (char *)header) {
        size_t block_size = get_block_size(previous_header);

        BlockHeader *next_header = (BlockHeader *)((char *)previous_header + block_size);

        if (next_header == header) {
            int is_alloc = is_allocated(previous_header);

            if (is_alloc == 0) {
                merge_block(previous_header, header);
            }

            return;
        }

        else {
            previous_header = next_header;
        }
    }
}

void coalesce_next(BlockHeader *header) {

    size_t block_size = get_block_size(header);

    BlockHeader *next_header = (BlockHeader *)((char *)header + block_size);

    while ((char *)next_header < (char *)heap_end) {

        int is_alloc = is_allocated(next_header);

        if (is_alloc == 0) {
            merge_block(header, next_header);

            block_size = get_block_size(header);

            next_header = (BlockHeader *)((char *)header + block_size);
        }

        else {
            return;
        }
    }
}

void mini_free(void *ptr) {

    if (ptr == NULL) {
        return;
    }

    BlockHeader *header = (BlockHeader *)((char *)ptr - sizeof(BlockHeader));

    mark_free(header);

    coalesce_next(header);

    coalesce_previous(header);
}