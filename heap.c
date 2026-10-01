#include <sys/mman.h>
#include <stddef.h>

void *heap_start;
void *heap_end;
size_t heap_size;

void *allocate_heap_region(size_t size) {
    
    void *p = mmap(
        NULL,
        size,
        PROT_READ | PROT_WRITE,
        MAP_PRIVATE | MAP_ANONYMOUS,
        -1,
        0
    );

    if (p == MAP_FAILED) {
        return NULL;
    }

    heap_start = p;
    heap_end = (char *)p + size;
    heap_size = size;
    
    return p;
}

void destroy_heap(void) {
    munmap(heap_start, heap_size);

    heap_start = NULL;
    heap_end = NULL;
    heap_size = 0;
}