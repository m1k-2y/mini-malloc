#include <Stddef.h>

size_t alignment(size_t block_size) {

    if (payload_size % 16 == 0) {
        return block_size;
    }

    else {
        size_t alignment_size = 16 * (block_size / 16 + 1);

        return alignment_size;
    }
}