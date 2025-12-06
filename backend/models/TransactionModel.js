import pool from '../config/db.js'

class TransactionModel {
  // Lấy tất cả giao dịch với pagination
  static async getAll(page = 1, limit = 60) {
    // Đảm bảo page và limit là số nguyên và hợp lệ
    const pageInt = Math.max(1, parseInt(page, 10) || 1)
    const limitInt = Math.max(1, Math.min(100, parseInt(limit, 10) || 60))
    const offset = (pageInt - 1) * limitInt
    
    // Lấy tổng số giao dịch
    const [countResult] = await pool.execute(`
      SELECT COUNT(*) as total
      FROM giao_dich
    `)
    const total = countResult[0].total
    
    // Lấy danh sách giao dịch với pagination
    const [rows] = await pool.execute(`
      SELECT 
        gd.id,
        gd.id_nguoi_gui,
        gd.id_nguoi_nhan,
        gd.id_loai_giao_dich,
        gd.so_diem_giao_dich,
        gd.id_giao_dich_doi_chung,
        gd.noi_dung_giao_dich,
        gd.created_at,
        gd.updated_at,
        lg.ten_loai_giao_dich,
        ng.ten_zalo as ten_nguoi_gui,
        nn.ten_zalo as ten_nguoi_nhan
      FROM giao_dich gd
      LEFT JOIN loai_giao_dich lg ON gd.id_loai_giao_dich = lg.id
      LEFT JOIN nguoi_dung ng ON gd.id_nguoi_gui = ng.id
      LEFT JOIN nguoi_dung nn ON gd.id_nguoi_nhan = nn.id
      ORDER BY gd.created_at DESC
      LIMIT ${limitInt} OFFSET ${offset}
    `)
    
    return {
      data: rows,
      pagination: {
        page: pageInt,
        limit: limitInt,
        total,
        totalPages: Math.ceil(total / limitInt)
      }
    }
  }

  // Lấy giao dịch theo ID
  static async getById(id) {
    const [rows] = await pool.execute(`
      SELECT 
        gd.*,
        lg.ten_loai_giao_dich,
        ng.ten_zalo as ten_nguoi_gui,
        nn.ten_zalo as ten_nguoi_nhan
      FROM giao_dich gd
      LEFT JOIN loai_giao_dich lg ON gd.id_loai_giao_dich = lg.id
      LEFT JOIN nguoi_dung ng ON gd.id_nguoi_gui = ng.id
      LEFT JOIN nguoi_dung nn ON gd.id_nguoi_nhan = nn.id
      WHERE gd.id = ?
    `, [id])
    return rows[0]
  }

  // Lấy giao dịch của người dùng (cả gửi và nhận) với pagination
  static async getByUserId(userId, page = 1, limit = 60) {
    // Đảm bảo page và limit là số nguyên và hợp lệ
    const pageInt = Math.max(1, parseInt(page, 10) || 1)
    const limitInt = Math.max(1, Math.min(100, parseInt(limit, 10) || 60))
    const offset = (pageInt - 1) * limitInt
    
    // Lấy tổng số giao dịch của user
    const [countResult] = await pool.execute(`
      SELECT COUNT(*) as total
      FROM giao_dich
      WHERE id_nguoi_gui = ? OR id_nguoi_nhan = ?
    `, [userId, userId])
    const total = countResult[0].total
    
    // Lấy danh sách giao dịch với pagination
    const [rows] = await pool.execute(`
      SELECT 
        gd.id,
        gd.id_nguoi_gui,
        gd.id_nguoi_nhan,
        gd.id_loai_giao_dich,
        gd.so_diem_giao_dich,
        gd.id_giao_dich_doi_chung,
        gd.noi_dung_giao_dich,
        gd.created_at,
        gd.updated_at,
        lg.ten_loai_giao_dich,
        ng.ten_zalo as ten_nguoi_gui,
        nn.ten_zalo as ten_nguoi_nhan
      FROM giao_dich gd
      LEFT JOIN loai_giao_dich lg ON gd.id_loai_giao_dich = lg.id
      LEFT JOIN nguoi_dung ng ON gd.id_nguoi_gui = ng.id
      LEFT JOIN nguoi_dung nn ON gd.id_nguoi_nhan = nn.id
      WHERE gd.id_nguoi_gui = ? OR gd.id_nguoi_nhan = ?
      ORDER BY gd.created_at DESC
      LIMIT ${limitInt} OFFSET ${offset}
    `, [userId, userId])
    
    return {
      data: rows,
      pagination: {
        page: pageInt,
        limit: limitInt,
        total,
        totalPages: Math.ceil(total / limitInt)
      }
    }
  }

  // Tạo giao dịch mới
  static async create(transactionData) {
    const { id_nguoi_gui, id_nguoi_nhan, id_loai_giao_dich, so_diem_giao_dich, id_giao_dich_doi_chung, noi_dung_giao_dich } = transactionData
    const [result] = await pool.execute(
      'INSERT INTO giao_dich (id_nguoi_gui, id_nguoi_nhan, id_loai_giao_dich, so_diem_giao_dich, id_giao_dich_doi_chung, noi_dung_giao_dich) VALUES (?, ?, ?, ?, ?, ?)',
      [id_nguoi_gui, id_nguoi_nhan, id_loai_giao_dich, so_diem_giao_dich, id_giao_dich_doi_chung || null, noi_dung_giao_dich || null]
    )
    return this.getById(result.insertId)
  }

  // Tạo nhiều giao dịch cùng lúc
  static async createMany(transactionsData) {
    const connection = await pool.getConnection()
    try {
      await connection.beginTransaction()

      const placeholders = transactionsData.map(() => '(?, ?, ?, ?, ?, ?)').join(', ')
      const values = transactionsData.flatMap(tx => [
        tx.id_nguoi_gui,
        tx.id_nguoi_nhan,
        tx.id_loai_giao_dich,
        tx.so_diem_giao_dich,
        tx.id_giao_dich_doi_chung || null,
        tx.noi_dung_giao_dich || null
      ])

      const [result] = await connection.execute(
        `INSERT INTO giao_dich (id_nguoi_gui, id_nguoi_nhan, id_loai_giao_dich, so_diem_giao_dich, id_giao_dich_doi_chung, noi_dung_giao_dich) VALUES ${placeholders}`,
        values
      )

      await connection.commit()

      // Lấy danh sách giao dịch vừa tạo
      const ids = []
      for (let i = 0; i < transactionsData.length; i++) {
        ids.push(result.insertId + i)
      }
      const [rows] = await connection.execute(`
        SELECT 
          gd.id,
          gd.id_nguoi_gui,
          gd.id_nguoi_nhan,
          gd.id_loai_giao_dich,
          gd.so_diem_giao_dich,
          gd.id_giao_dich_doi_chung,
          gd.noi_dung_giao_dich,
          gd.created_at,
          gd.updated_at,
          lg.ten_loai_giao_dich,
          ng.ten_zalo as ten_nguoi_gui,
          nn.ten_zalo as ten_nguoi_nhan
        FROM giao_dich gd
        LEFT JOIN loai_giao_dich lg ON gd.id_loai_giao_dich = lg.id
        LEFT JOIN nguoi_dung ng ON gd.id_nguoi_gui = ng.id
        LEFT JOIN nguoi_dung nn ON gd.id_nguoi_nhan = nn.id
        WHERE gd.id IN (${ids.map(() => '?').join(',')})
        ORDER BY gd.created_at DESC
      `, ids)

      return rows
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  }

  // Lấy loại giao dịch theo tên
  static async getLoaiGiaoDichByName(ten_loai) {
    const [rows] = await pool.execute(
      'SELECT * FROM loai_giao_dich WHERE ten_loai_giao_dich = ?',
      [ten_loai]
    )
    return rows[0]
  }

  // Lấy loại giao dịch theo ID
  static async getLoaiGiaoDichById(id) {
    const [rows] = await pool.execute(
      'SELECT * FROM loai_giao_dich WHERE id = ?',
      [id]
    )
    return rows[0]
  }
}

export default TransactionModel

