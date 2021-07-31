//
// Created by a2882 on 2021/7/25.
//

#ifndef PDF_TOOL_SETTING_H
#define PDF_TOOL_SETTING_H

#include <QString>
#include <QSettings>
#include <QDir>

#define APP_Name "PDF_Tool"

#ifdef Q_OS_WIN32
#define Picture_Folder_Name "Pictures"
#endif

#ifdef Q_OS_LINUX
#define Picture_Folder_Name "圖片"
#endif

class Setting {
public:
    Setting(QString input_filepath, QString  section);
    explicit Setting(QString input_section);
    ~Setting();
    bool is_file_generate();
    void generate_file();
    void change_section(const QString &section);
    void write(const QString &input_key, const QVariant &input_value);
    void write(const QString &input_section, const QString &input_key, const QVariant &input_value);
    QVariant read(const QString &key);

private:
    QSettings *settings;
    QString section;
    QString filepath;
    QString filename = "setting.ini";
};

namespace Setting_Sections {
    struct PDFWidget {
        QString section = "PDF-Widget-Option";
        struct keys {
            QString dpi_list = "DPI-List";
            QString format_list = {"Format-List"};
            QString dpi = "Last-Choose-DPi";
            QString format = "Last-Choose-Format";
            QString image_output_path = "default_output_path";
        };
        keys key;
    };
}

#endif //PDF_TOOL_SETTING_H
