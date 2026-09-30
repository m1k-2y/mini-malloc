#include <stdio.h>
#include <stddef.h>
#include "block.h"

int main(void) {
    printf("%zu\n", sizeof(BlockHeader));

    BlockHeader header;

    header.size_and_flag = 65;

    printf("raw: %zu\n", header.size_and_flag);
    printf("size: %zu\n", get_block_size(&header));
    
    return 0;
}