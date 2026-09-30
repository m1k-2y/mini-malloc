#include <stdio.h>
#include <stddef.h>

typedef struct {
    size_t size_and_flag;
    size_t padding;
} BlockHeader;


int main(void) {
    printf("%zu\n", sizeof(BlockHeader));
    return 0;
}