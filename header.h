#include <stddef.h>

struct BlockHeader {
    size_t size_and_alloc;
    size_t something;
};

void *init_header(void *p, size_t size);
size_t header_reader(void *p);
void *request_block(void *heap_start, size_t size, size_t heap_size);