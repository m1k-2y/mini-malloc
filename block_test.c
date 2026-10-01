#include <stdio.h>
#include <stddef.h>
#include "block.h"

void test_header_size(void) {

    printf("Is BlockHeader size 16 bytes?\n");

    printf("BlockHeader size: %zu\n", sizeof(BlockHeader));
}

void test_get_block_size(void) {

    printf("Is allocation flag removed when reading block size?\n");

    BlockHeader header;

    header.size_and_flag = 65;

    printf("raw size_and_flag: %zu\n", header.size_and_flag);
    printf("block size: %zu\n", get_block_size(&header));
}

void test_allocation_flag(void) {

    printf("Is allocation flag detected correctly?\n");

    BlockHeader header;

    header.size_and_flag = 65;

    printf("allocated with raw 65: %d\n", is_allocated(&header));

    header.size_and_flag = 64;

    printf("allocated with raw 64: %d\n", is_allocated(&header));
}

int main(void) {

    test_header_size();

    test_get_block_size();

    test_allocation_flag();

    return 0;
}