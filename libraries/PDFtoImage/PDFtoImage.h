//
// Created by a2882 on 2021/7/19.
//

#ifndef PDF_TOOL_PDFTOIMAGE_H
#define PDF_TOOL_PDFTOIMAGE_H

#include <QString>
#include <QImage>
#include <poppler/qt5/poppler-qt5.h>
#include <memory.h>

struct conversionData
{
    QString output_path;
    QString file_name;
    int image_dpi;
    QString image_format;
};

class PDFtoImage
{
public:
    // Constructor 時會讀取PDF文件
    explicit PDFtoImage(const QString &file_path);

    // Destructor時釋放文件，delete之前讀取的物件
    ~PDFtoImage();

    //轉換PDF文件到圖片
    void conversion_image(const QString &output_path, const QString &file_name, int image_dpi, const QString &image_format);

    conversionData conversion_data;

private:
    //紀錄PDF文件總頁數
    int num_pages = 0;

    //處存PDF文件資料
    std::shared_ptr<Poppler::Document> document;

    int max_cpu_core;

    void conversion_image_one(const std::shared_ptr<Poppler::Document> &pointer_document, int index, const conversionData &data);
};

#endif //PDF_TOOL_PDFTOIMAGE_H
