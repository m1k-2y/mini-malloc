#include <stddef.h>

typedef struct {
    size_t size_and_flag;
    size_t padding;
} BlockHeader;

void mark_allocated(BlockHeader *header) {

    header -> size_and_flag |= 1;
}

void mark_free(BlockHeader *header) {

    header -> size_and_flag &= ~1;
}

void init_block_header(void *header_start, size_t block_size) {

    BlockHeader *header = (BlockHeader *) header_start;

    header -> size_and_flag = block_size;
}

int is_allocated(BlockHeader *header) {

    return header -> size_and_flag & 1;
}

size_t get_block_size(BlockHeader *header) {

    return header -> size_and_flag & ~1;
}