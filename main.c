#include "mm.h"
#include <stdio.h>

int main(void) {

    int result = mm_init();

    if (result == -1) {
        return -1;
    }

    void *a = mm_malloc(100);
    void *b = mm_malloc(50);

    printf("a = %p\n", a);
    printf("b = %p\n", b);

    printf("b -> a = %ld\n", (char *)b - (char *)a);

    void *a_header = (char *)a - 8;
    printf("*a_header = %zu\n", *(size_t *)a_header);

    *(int *)a = 111;
    *(int *)b = 222;

    printf("*a = %d\n", *(int *)a);
    printf("*b = %d\n", *(int *)b);

    return 0;
}