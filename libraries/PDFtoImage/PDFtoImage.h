//
// Created by a2882 on 2021/7/19.
//

#ifndef PDF_TOOL_PDFTOIMAGE_H
#define PDF_TOOL_PDFTOIMAGE_H

#include <QString>
#include <QImage>
#include <poppler/qt5/poppler-qt5.h>

class PDFtoImage {
public:
    // Constructor 時會讀取PDF文件
    explicit PDFtoImage(const QString& file_path);

    // Destructor時釋放文件，delete之前讀取的物件
    ~PDFtoImage();

    //轉換PDF文件到圖片
    void conversion_image(const QString& output_path, const QString& file_name, int image_dpi, const QString& image_format);

private:
    //紀錄PDF文件總頁數
    int num_pages = 0;

    //處存PDF文件資料
    Poppler::Document* document;

    //處存每頁的資料
    QVector<Poppler::Page*> pages;
};


#endif //PDF_TOOL_PDFTOIMAGE_H
