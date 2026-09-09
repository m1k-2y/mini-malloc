#include <sys/mman.h>
#include <stddef.h>

void *heap_start;

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
    
    return p;
}