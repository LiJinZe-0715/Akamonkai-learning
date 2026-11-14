/** 出站端口：草稿是按课次与视图索引的本地不透明存储。 */
export interface DraftRepository {
    read(key: string): unknown;

    write(key: string, value: unknown): boolean;

    remove(key: string): boolean;

    /** 删掉全部草稿（清空学习记录时用）。 */
    removeAll(): boolean;
}
