#include <stdio.h>

int main() {
    int x = 42;
    int *p = &x;

    printf("x = %d\n", x);
    printf("&x = %p\n", &x);
    printf("p = %p\n", p);
    printf("*p = %d\n", *p);
    printf("&p = %p\n", &p);

    return 0;
}