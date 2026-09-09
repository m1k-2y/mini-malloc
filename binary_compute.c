#include <stdio.h>
#include <stddef.h>

void print_binary(size_t value) {

    size_t bits = sizeof(size_t) * 8;

    for (size_t i = bits; i > 0; i--) {
        size_t bit = (value >> (i - 1)) & 1;

        printf("%zu", bit);
    }

    printf("\n");
}