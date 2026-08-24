#include <unistd.h>
#include <sys/mman.h>
#include <stdio.h>

int main(void) {
    int x = 42;

    void *before = sbrk(0);
    printf("[sbrk] before = %p\n", before);

    void *p = sbrk(4096);
    printf("[sbrk] p = %p\n", p);

    void *after = sbrk(0);
    printf("[sbrk] after = %p\n", after);

    void *heap_start = mmap(NULL, 4096, PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);

    if (heap_start == MAP_FAILED) {
        return -1;
    }

    printf("[mmap] heap_start = %p\n", heap_start);

    *(size_t *)heap_start = 8;

    void *user_ptr = (char *)heap_start + 8;
    *(int *)user_ptr = 999;

    size_t size = *(size_t *)((char *)user_ptr - 8);

    printf("size = %zu\n", size);

    return 0;
}