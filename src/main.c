#include <ctype.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include "heap.h"
#include "block.h"
#include "malloc.h"
#include "free.h"

#define MAX_VARIABLES 100
#define MAX_NAME_LENGTH 31
#define LINE_SIZE 256

typedef struct {
    char name[MAX_NAME_LENGTH + 1];
    void *pointer;
    int active;
} Variable;

/* Return 1 for a line, 0 for EOF, and -1 for an overlong line. */
static int read_line(char *line) {
    if (fgets(line, LINE_SIZE, stdin) == NULL) {
        return 0;
    }

    size_t length = strlen(line);
    if (length > 0 && line[length - 1] != '\n') {
        int ch = getchar();
        if (ch != '\n' && ch != EOF) {
            while ((ch = getchar()) != '\n' && ch != EOF) {
                /* Discard the rest so it cannot become another command. */
            }
            return -1;
        }
    }

    while (length > 0 && isspace((unsigned char)line[length - 1])) {
        line[--length] = '\0';
    }
    return 1;
}

/* Accept decimal digits only, checking overflow before each operation. */
static int parse_size(const char *text, size_t *value) {
    *value = 0;
    if (*text == '\0') {
        return 0;
    }
    for (; *text != '\0'; ++text) {
        if (*text < '0' || *text > '9') {
            return 0;
        }
        size_t digit = (size_t)(*text - '0');
        if (*value > (SIZE_MAX - digit) / 10) {
            return 0;
        }
        *value = *value * 10 + digit;
    }
    return 1;
}

int main(void) {
    char line[LINE_SIZE];
    char number[LINE_SIZE];
    size_t memory_size;
    int end = -1;

    printf("Heap size: ");
    fflush(stdout);
    if (read_line(line) != 1 ||
        sscanf(line, " %255[0-9] %n", number, &end) != 1 ||
        end < 0 || line[end] != '\0' ||
        !parse_size(number, &memory_size) || memory_size == 0 ||
        memory_size > SIZE_MAX - 15) {
        puts("Invalid heap size.");
        return 1;
    }

    memory_size = alignment(memory_size);
    if (memory_size < sizeof(BlockHeader)) {
        puts("Invalid heap size.");
        return 1;
    }
    void *heap = allocate_heap_region(memory_size);
    if (heap == NULL) {
        puts("Heap allocation failed.");
        return 1;
    }
    init_block_header(heap, memory_size);

    Variable variables[MAX_VARIABLES] = {0};
    int variable_count = 0;

    while (1) {
        printf("> ");
        fflush(stdout);
        int result = read_line(line);
        if (result == 0) {
            break;
        }
        if (result == -1) {
            puts("Invalid command.");
            continue;
        }

        char *command = line;
        while (isspace((unsigned char)*command)) {
            ++command;
        }
        if (strcmp(command, "exit;") == 0) {
            break;
        }

        char name[MAX_NAME_LENGTH + 1];
        end = -1;
        /* Scan widths match MAX_NAME_LENGTH and LINE_SIZE - 1. */
        int fields = sscanf(command,
                            "void * %31[a-zA-Z0-9_] = malloc ( %255[0-9] ) ; %n",
                            name, number, &end);
        if (fields == 2 && end >= 0 && command[end] == '\0' &&
            !(name[0] >= '0' && name[0] <= '9')) {
            size_t size;
            if (!parse_size(number, &size)) {
                puts("Invalid command.");
                continue;
            }

            int index;
            for (index = 0; index < variable_count; ++index) {
                if (strcmp(variables[index].name, name) == 0) {
                    break;
                }
            }
            if (index < variable_count) {
                puts("Variable already exists.");
                continue;
            }
            if (variable_count == MAX_VARIABLES) {
                puts("Variable table is full.");
                continue;
            }

            /* Guard the allocator's alignment and header-size addition. */
            if (size > SIZE_MAX - 15 - sizeof(BlockHeader)) {
                puts("allocation failed");
                continue;
            }
            void *pointer = mini_malloc(size);
            if (pointer == NULL) {
                puts("allocation failed");
                continue;
            }

            strcpy(variables[variable_count].name, name);
            variables[variable_count].pointer = pointer;
            variables[variable_count].active = 1;
            ++variable_count;
            printf("%s = %p\n", name, pointer);
            continue;
        }

        end = -1;
        fields = sscanf(command, "free ( %31[a-zA-Z0-9_] ) ; %n", name, &end);
        if (fields == 1 && end >= 0 && command[end] == '\0' &&
            !(name[0] >= '0' && name[0] <= '9')) {
            int index;
            for (index = 0; index < variable_count; ++index) {
                if (strcmp(variables[index].name, name) == 0) {
                    break;
                }
            }
            if (index == variable_count || !variables[index].active) {
                puts("Variable does not exist or is already freed.");
                continue;
            }

            mini_free(variables[index].pointer);
            variables[index].pointer = NULL;
            variables[index].active = 0;
            printf("%s freed.\n", name);
            continue;
        }

        puts("Invalid command.");
    }

    destroy_heap();
    return 0;
}
