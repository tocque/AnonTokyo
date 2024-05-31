export const splitArray = <T>(array: T[], predictor: (val: T) => boolean) => {
    const chunks: T[][] = [[]];
    for (const item of array) {
        if (predictor(item)) {
            chunks.push([item]);
            chunks.push([]);
        } else {
            chunks.at(-1)!.push(item);
        }
    }
    return chunks;
}