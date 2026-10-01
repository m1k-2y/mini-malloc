#include <stddef.h>
#include "block.h"

void mini_free(void *ptr) {

    if (ptr == NULL) {
        return;
    }

    BlockHeader *header = (BlockHeader *)((char *)ptr - sizeof(BlockHeader));

    mark_free(header);
}