#include "mm.h"
#include "mm_internal.h"
#include <stdio.h>

int main(void) {

    int result = mm_init();

    if (result == -1) {
        return -1;
    }

    void *a = mm_malloc(100);
    void *b = mm_malloc(50);
    void *c = mm_malloc(7);
    void *d = mm_malloc(1000);

    printf("a = %p\n", a);
    printf("b = %p\n", b);
    printf("c = %p\n", c);
    printf("d = %p\n", d);

    printf("b -> a = %ld\n", (char *)b - (char *)a);

    void *a_header = hdrp(a);
    printf("size = %zu\n", get_size(a_header));
    printf("alloc = %zu\n", get_alloc(a_header));

    *(int *)a = 111;
    *(int *)b = 222;

    printf("*a = %d\n", *(int *)a);
    printf("*b = %d\n", *(int *)b);

    printf("before free alloc = %zu\n", get_alloc(hdrp(a)));
    mm_free(a);
    printf("after free alloc = %zu\n", get_alloc(hdrp(a)));

    printf("after free alloc *a = %d\n", *(int *)a);

    return 0;
}