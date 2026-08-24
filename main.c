#include "heap.h"
#include <stdio.h>

int main(void) {
    int result = mem_init(4096);

    if (result == -1) {
        printf("Failed.\n");
    }

    else {
        printf("Success.\n");
    }

    return 0;
}