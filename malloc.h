#include <stddef.h>

size_t alignment(size_t block_size);
void *mini_malloc(size_t size);
size_t required_block_size(size_t payload_size);