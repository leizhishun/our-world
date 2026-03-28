/**
 * Bmob 后端云配置文件
 * 
 * 请按照以下步骤配置：
 * 1. 注册 Bmob 账号：https://www.bmobapp.com（用邮箱注册，然后邮箱激活）
 * 2. 登录后，点击左上角「创建应用」，输入名字（比如"情侣空间"）
 * 3. 进入应用 → 设置 → 应用密钥
 * 4. 将 Application ID 和 REST API Key 填入下方
 */

Bmob.initialize("cea0eff9348ea338dd6f4d7ddb56e8cf", "0a0ca9fec4d3a1edceb561540868d13d");

/**
 * 数据表名配置（无需手动创建，首次运行时 Bmob 会自动建表）
 */
const BM_TABLE = {
    APP_DATA: 'CoupleAppData'  // 主数据表（存储所有应用数据，JSON 格式）
};
