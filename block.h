#ifndef BLOCK_H
#define BLOCK_H

#include <stddef.h>

typedef struct {
    size_t size_and_flag;
    size_t padding;
} BlockHeader;

void mark_allocated(BlockHeader *header);

void init_block_header(void *header_start, size_t block_size);

int is_allocated(BlockHeader *header);

size_t get_block_size(BlockHeader *header);

#endif