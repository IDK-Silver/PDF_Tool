//
// Created by a2882 on 2021/7/25.
//

#include "Setting.h"
#include <QDebug>
#include <utility>
#include <QDir>
#include <QStandardPaths>





Setting::Setting(QString input_filepath, QString input_section) : section(std::move(input_section)), filepath(std::move(input_filepath)) {
    this->settings = new QSettings(this->filepath, QSettings::IniFormat);
    QDir dir;
    dir.mkdir(QStandardPaths::writableLocation(QStandardPaths::AppDataLocation));
}

Setting::Setting(QString input_section) : section(std::move(input_section)){
    this->filepath = QStandardPaths::writableLocation(QStandardPaths::AppDataLocation) + QDir::separator() + this->filename;
    QDir dir;
    dir.mkdir(QStandardPaths::writableLocation(QStandardPaths::AppDataLocation));
    this->settings = new QSettings(this->filepath, QSettings::IniFormat);
}

Setting::~Setting() {
    delete settings;
}

void Setting::write(const QString &input_key, const QVariant &input_value) {
    this->settings->setValue(this->section + "/" + input_key, input_value);
}

void Setting::write(const QString &input_section, const QString &input_key, const QVariant &input_value) {
    this->settings->setValue(input_section + "/" + input_key, input_value);
}

QVariant Setting::read(const QString &key) {
    return this->settings->value(this->section + "/" + key);
}

void Setting::change_section(const QString &input_section) {
    this->section = input_section;
}

bool Setting::is_file_generate() {
    QFileInfo fileInfo(this->filepath);
    return fileInfo.exists();
}

void Setting::generate_file() {
    {   // PDF Tool Option Main Option
        Setting_Sections::PDF_Tool option;

        this->write(option.section, option.key.version, APP_Version);
    }

    {   // PDF Widget Option
        Setting_Sections::PDFWidget option;

        QStringList format_list = {"JPG", "PNG", "BMP", "TIF", "WEBP"};
        this->write(option.section, option.key.format_list, format_list);
        QStringList dpi_list = {"72", "96", "163", "300"};
        this->write(option.section, option.key.dpi_list, dpi_list);

        this->write(option.section, option.key.dpi, "300");
        this->write(option.section, option.key.format, "PNG");
        this->write(option.section, option.key.image_output_path, QDir::homePath() + "/" + QString(Picture_Folder_Name) + "/" + "轉換圖片");

    }
}














