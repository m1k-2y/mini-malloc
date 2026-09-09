#include <stdio.h>
#include <stddef.h>
#include "heap.h"
#include "header.h"
#include "binary_compute.h"

int main(void) {

    size_t size;
    printf("How much heap size: ");
    scanf("%zu", &size);

    void *p = allocate_heap_region(size);

    if (p == NULL) {
        return 1;
    }

    printf("%p\n", p);

    struct BlockHeader *header1 = init_header(p, size);

    print_binary(header1 -> size_and_alloc);

    while (1) {
        size_t malloc_size;
        printf("How much Bytes: ");
        scanf("%zu", &malloc_size);

        void * payload = request_block(p, malloc_size, size);

        printf("%p\n", payload);
    }
    
    return 0;
}